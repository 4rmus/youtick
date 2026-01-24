#!/usr/bin/env node
/**
 * Lighthouse Storage MCP Server
 * Provides IPFS/Filecoin storage operations through MCP interface
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import lighthouse from "@lighthouse-web3/sdk";
import * as fs from "fs";
import * as path from "path";

const API_KEY = process.env.LIGHTHOUSE_API_KEY;
const GATEWAY_URL = "https://gateway.lighthouse.storage/ipfs";

const server = new Server(
  { name: "lighthouse-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lighthouse_upload",
      description: "Upload a file to Lighthouse/IPFS storage. Returns the IPFS CID.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to file to upload" },
          name: { type: "string", description: "Optional name for the upload" }
        },
        required: ["filePath"]
      }
    },
    {
      name: "lighthouse_upload_text",
      description: "Upload text content to Lighthouse/IPFS. Returns the IPFS CID.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Text content to upload" },
          filename: { type: "string", description: "Filename for the content (default: content.txt)" }
        },
        required: ["content"]
      }
    },
    {
      name: "lighthouse_status",
      description: "Check Filecoin deal status for a CID",
      inputSchema: {
        type: "object",
        properties: {
          cid: { type: "string", description: "IPFS CID to check" }
        },
        required: ["cid"]
      }
    },
    {
      name: "lighthouse_uploads",
      description: "List all uploads for the configured API key",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of uploads to return (default: 20)" }
        }
      }
    },
    {
      name: "lighthouse_file_info",
      description: "Get detailed file information by CID",
      inputSchema: {
        type: "object",
        properties: {
          cid: { type: "string", description: "IPFS CID" }
        },
        required: ["cid"]
      }
    },
    {
      name: "lighthouse_fetch",
      description: "Fetch content from IPFS gateway by CID",
      inputSchema: {
        type: "object",
        properties: {
          cid: { type: "string", description: "IPFS CID to fetch" },
          asJson: { type: "boolean", description: "Parse response as JSON (default: false)" }
        },
        required: ["cid"]
      }
    },
    {
      name: "lighthouse_gateway_url",
      description: "Get the gateway URL for a CID",
      inputSchema: {
        type: "object",
        properties: {
          cid: { type: "string", description: "IPFS CID" }
        },
        required: ["cid"]
      }
    },
    {
      name: "lighthouse_balance",
      description: "Get storage balance and usage for the API key",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!API_KEY) {
    return {
      content: [{
        type: "text",
        text: "Error: LIGHTHOUSE_API_KEY environment variable not set"
      }],
      isError: true
    };
  }

  try {
    switch (name) {
      case "lighthouse_upload": {
        const filePath = args?.filePath as string;

        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const response = await lighthouse.upload(
          filePath,
          API_KEY
        );

        const data = response.data as { Hash: string; Size: string; Name: string };

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              cid: data.Hash,
              size: data.Size,
              name: data.Name,
              gatewayUrl: `${GATEWAY_URL}/${data.Hash}`
            }, null, 2)
          }]
        };
      }

      case "lighthouse_upload_text": {
        const content = args?.content as string;
        const filename = (args?.filename as string) || "content.txt";

        // Create temp file
        const tempDir = process.env.TMPDIR || "/tmp";
        const tempPath = path.join(tempDir, `lighthouse_${Date.now()}_${filename}`);
        fs.writeFileSync(tempPath, content);

        try {
          const response = await lighthouse.upload(
            tempPath,
            API_KEY
          );

          const data = response.data as { Hash: string; Size: string; Name: string };

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                cid: data.Hash,
                size: data.Size,
                gatewayUrl: `${GATEWAY_URL}/${data.Hash}`
              }, null, 2)
            }]
          };
        } finally {
          // Cleanup temp file
          fs.unlinkSync(tempPath);
        }
      }

      case "lighthouse_status": {
        const cid = args?.cid as string;
        const response = await lighthouse.dealStatus(cid);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response.data, null, 2)
          }]
        };
      }

      case "lighthouse_uploads": {
        const response = await lighthouse.getUploads(API_KEY);
        const uploads = response.data as { fileList: Array<{
          publicKey: string;
          fileName: string;
          mimeType: string;
          txHash: string;
          status: string;
          createdAt: number;
          fileSizeInBytes: string;
          cid: string;
        }> };

        const limit = (args?.limit as number) || 20;
        const limitedUploads = uploads.fileList?.slice(0, limit) || [];

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: limitedUploads.length,
              uploads: limitedUploads.map(u => ({
                cid: u.cid,
                fileName: u.fileName,
                size: u.fileSizeInBytes,
                status: u.status,
                createdAt: new Date(u.createdAt).toISOString()
              }))
            }, null, 2)
          }]
        };
      }

      case "lighthouse_file_info": {
        const cid = args?.cid as string;
        const url = `https://api.lighthouse.storage/api/lighthouse/file_info?cid=${cid}`;

        const response = await fetch(url);
        const data = await response.json();

        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }

      case "lighthouse_fetch": {
        const cid = args?.cid as string;
        const asJson = args?.asJson as boolean;

        const response = await fetch(`${GATEWAY_URL}/${cid}`, {
          signal: AbortSignal.timeout(30000) // 30s timeout
        });

        if (!response.ok) {
          throw new Error(`Gateway returned ${response.status}: ${response.statusText}`);
        }

        let content: string;
        if (asJson) {
          const json = await response.json();
          content = JSON.stringify(json, null, 2);
        } else {
          content = await response.text();
          // Truncate if too long
          if (content.length > 10000) {
            content = content.substring(0, 10000) + "\n... (truncated)";
          }
        }

        return {
          content: [{
            type: "text",
            text: content
          }]
        };
      }

      case "lighthouse_gateway_url": {
        const cid = args?.cid as string;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              cid,
              primary: `${GATEWAY_URL}/${cid}`,
              alternatives: [
                `https://ipfs.io/ipfs/${cid}`,
                `https://cloudflare-ipfs.com/ipfs/${cid}`,
                `https://w3s.link/ipfs/${cid}`
              ]
            }, null, 2)
          }]
        };
      }

      case "lighthouse_balance": {
        const response = await lighthouse.getBalance(API_KEY);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response.data, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Lighthouse MCP server running");
console.error("Gateway:", GATEWAY_URL);
console.error("API Key:", API_KEY ? "configured" : "NOT SET");
