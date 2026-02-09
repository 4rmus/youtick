# Nova Tutorials

Step-by-step guides for common Nova use cases.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Building a File Sharing App](#building-a-file-sharing-app)
3. [Integrating with Claude AI](#integrating-with-claude-ai)
4. [Team Document Management](#team-document-management)
5. [Secure Offboarding](#secure-offboarding)

---

## Getting Started

### Prerequisites

- Node.js 18+ or Rust 1.70+
- NEAR testnet account
- Basic understanding of async/await

### Step 1: Create a NEAR Testnet Account

```bash
# Install NEAR CLI
npm install -g near-cli

# Create a testnet account
near create-account your-name.testnet --useFaucet
```

### Step 2: Install Nova SDK

```bash
# JavaScript/TypeScript
npm install nova-sdk-js

# Or Rust
cargo add nova-sdk-rs
```

### Step 3: Initialize the SDK

```typescript
import { NovaSDK } from 'nova-sdk-js';
import { keyStores, connect } from 'near-api-js';

// Set up NEAR connection
const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
  `${process.env.HOME}/.near-credentials`
);

const nearConfig = {
  networkId: 'testnet',
  keyStore,
  nodeUrl: 'https://rpc.testnet.near.org',
};

const near = await connect(nearConfig);
const account = await near.account('your-name.testnet');

// Initialize Nova
const nova = new NovaSDK({
  networkId: 'testnet',
  contractId: 'nova.testnet',
  shadeAgentUrl: 'https://shade-testnet.phala.network',
  nearConnection: near
});

console.log('Nova SDK initialized!');
```

### Step 4: Create Your First Group

```typescript
const group = await nova.createGroup({
  name: 'My First Group',
  members: [], // Just you for now
  metadata: {
    description: 'Testing Nova'
  }
});

console.log(`Group created: ${group.groupId}`);
```

### Step 5: Upload a Test File

```typescript
// Create a simple text file
const content = new TextEncoder().encode('Hello, Nova!');
const file = new Blob([content], { type: 'text/plain' });

const result = await nova.uploadFile({
  groupId: group.groupId,
  file,
  metadata: {
    fileName: 'hello.txt',
    mimeType: 'text/plain'
  }
});

console.log(`File uploaded! CID: ${result.cid}`);
```

### Step 6: Download and Verify

```typescript
const downloaded = await nova.downloadFile({
  groupId: group.groupId,
  cid: result.cid
});

const text = await downloaded.text();
console.log(`Downloaded content: ${text}`);
// Output: "Hello, Nova!"
```

---

## Building a File Sharing App

### Overview

Build a React application for secure team file sharing.

### Project Setup

```bash
npx create-react-app nova-share --template typescript
cd nova-share
npm install nova-sdk-js @near-wallet-selector/core @near-wallet-selector/my-near-wallet
```

### App Structure

```
nova-share/
├── src/
│   ├── components/
│   │   ├── GroupList.tsx
│   │   ├── FileList.tsx
│   │   ├── FileUpload.tsx
│   │   └── MemberManager.tsx
│   ├── hooks/
│   │   ├── useNova.ts
│   │   └── useWallet.ts
│   ├── contexts/
│   │   └── NovaContext.tsx
│   ├── App.tsx
│   └── index.tsx
```

### Nova Context Provider

```typescript
// src/contexts/NovaContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { NovaSDK, Group } from 'nova-sdk-js';

interface NovaContextType {
  nova: NovaSDK | null;
  groups: Group[];
  loading: boolean;
  createGroup: (name: string, members: string[]) => Promise<string>;
  uploadFile: (groupId: string, file: File) => Promise<string>;
  downloadFile: (groupId: string, cid: string) => Promise<Blob>;
}

const NovaContext = createContext<NovaContextType | null>(null);

export function NovaProvider({ children }: { children: React.ReactNode }) {
  const [nova, setNova] = useState<NovaSDK | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      // Initialize Nova SDK (see Getting Started)
      const sdk = new NovaSDK({ /* config */ });
      setNova(sdk);

      // Load user's groups
      const userGroups = await sdk.listGroups({});
      setGroups(userGroups);
      setLoading(false);
    }
    init();
  }, []);

  const createGroup = async (name: string, members: string[]) => {
    if (!nova) throw new Error('Nova not initialized');
    const result = await nova.createGroup({ name, members });
    setGroups(prev => [...prev, result]);
    return result.groupId;
  };

  const uploadFile = async (groupId: string, file: File) => {
    if (!nova) throw new Error('Nova not initialized');
    const result = await nova.uploadFile({
      groupId,
      file,
      metadata: { fileName: file.name, mimeType: file.type }
    });
    return result.cid;
  };

  const downloadFile = async (groupId: string, cid: string) => {
    if (!nova) throw new Error('Nova not initialized');
    return nova.downloadFile({ groupId, cid });
  };

  return (
    <NovaContext.Provider value={{
      nova, groups, loading, createGroup, uploadFile, downloadFile
    }}>
      {children}
    </NovaContext.Provider>
  );
}

export const useNova = () => {
  const context = useContext(NovaContext);
  if (!context) throw new Error('useNova must be inside NovaProvider');
  return context;
};
```

### File Upload Component

```typescript
// src/components/FileUpload.tsx
import React, { useState, useCallback } from 'react';
import { useNova } from '../contexts/NovaContext';

interface Props {
  groupId: string;
  onUploadComplete: (cid: string) => void;
}

export function FileUpload({ groupId, onUploadComplete }: Props) {
  const { uploadFile } = useNova();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const cid = await uploadFile(groupId, file);
      onUploadComplete(cid);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [groupId, uploadFile, onUploadComplete]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{
        border: '2px dashed #ccc',
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        cursor: 'pointer'
      }}
    >
      {uploading ? (
        <p>Uploading... {progress}%</p>
      ) : (
        <p>Drop files here to upload (encrypted automatically)</p>
      )}
    </div>
  );
}
```

### File List Component

```typescript
// src/components/FileList.tsx
import React, { useState, useEffect } from 'react';
import { useNova } from '../contexts/NovaContext';

interface FileInfo {
  cid: string;
  fileName: string;
  size: number;
  uploadedBy: string;
  uploadedAt: number;
}

interface Props {
  groupId: string;
}

export function FileList({ groupId }: Props) {
  const { nova, downloadFile } = useNova();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFiles() {
      if (!nova) return;
      const result = await nova.listGroupFiles({ groupId });
      setFiles(result);
      setLoading(false);
    }
    loadFiles();
  }, [nova, groupId]);

  const handleDownload = async (cid: string, fileName: string) => {
    const blob = await downloadFile(groupId, cid);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <p>Loading files...</p>;

  return (
    <ul>
      {files.map(file => (
        <li key={file.cid}>
          <span>{file.fileName}</span>
          <span>{(file.size / 1024).toFixed(1)} KB</span>
          <button onClick={() => handleDownload(file.cid, file.fileName)}>
            Download
          </button>
        </li>
      ))}
    </ul>
  );
}
```

---

## Integrating with Claude AI

### Overview

Set up Nova MCP server for Claude Desktop or Claude Code.

### Step 1: Install MCP Server

```bash
npm install -g nova-mcp-server
```

### Step 2: Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nova": {
      "command": "npx",
      "args": ["nova-mcp-server"],
      "env": {
        "NEAR_ACCOUNT_ID": "your-account.testnet",
        "NEAR_PRIVATE_KEY": "ed25519:YOUR_PRIVATE_KEY",
        "NEAR_NETWORK_ID": "testnet",
        "NOVA_CONTRACT_ID": "nova.testnet",
        "SHADE_AGENT_URL": "https://shade-testnet.phala.network"
      }
    }
  }
}
```

### Step 3: Test with Claude

```
You: Create a Nova group called "AI Documents" for my team

Claude: I'll create that group for you now.
[Uses nova_create_group tool]
Done! I've created the "AI Documents" group. The group ID is group-xyz789.

You: Upload the file at ~/Documents/report.pdf to that group

Claude: [Uses nova_upload_file tool]
The file has been encrypted and uploaded. CID: QmAbc123...

You: Who can access files in that group?

Claude: [Uses nova_get_group_info tool]
Currently, only you (your-account.testnet) have access as the owner.
Would you like me to add other members?
```

### Step 4: Claude Code Integration

For Claude Code, add to `.claude/settings.json` in your project:

```json
{
  "mcpServers": {
    "nova": {
      "command": "npx",
      "args": ["nova-mcp-server"],
      "env": {
        "NEAR_ACCOUNT_ID": "${NEAR_ACCOUNT_ID}",
        "NEAR_PRIVATE_KEY": "${NEAR_PRIVATE_KEY}",
        "NEAR_NETWORK_ID": "testnet",
        "NOVA_CONTRACT_ID": "nova.testnet",
        "SHADE_AGENT_URL": "https://shade-testnet.phala.network"
      }
    }
  }
}
```

---

## Team Document Management

### Scenario

Set up secure document sharing for a team with different access levels.

### Step 1: Create Team Group

```typescript
const teamGroup = await nova.createGroup({
  name: 'Engineering Team',
  members: [
    'alice.near',   // Team lead
    'bob.near',     // Senior dev
    'carol.near',   // Developer
    'david.near'    // Junior dev
  ],
  metadata: {
    department: 'Engineering',
    created: new Date().toISOString()
  }
});
```

### Step 2: Set Up Roles

```typescript
// Make alice an admin
await nova.updateMemberRole({
  groupId: teamGroup.groupId,
  memberId: 'alice.near',
  newRole: 'admin'
});

// Make bob an admin
await nova.updateMemberRole({
  groupId: teamGroup.groupId,
  memberId: 'bob.near',
  newRole: 'admin'
});

// carol and david remain members
```

### Step 3: Upload Team Documents

```typescript
// Architecture document
await nova.uploadFile({
  groupId: teamGroup.groupId,
  file: architectureDoc,
  metadata: {
    fileName: 'architecture.md',
    category: 'design',
    version: '1.0'
  }
});

// API specification
await nova.uploadFile({
  groupId: teamGroup.groupId,
  file: apiSpec,
  metadata: {
    fileName: 'api-spec.yaml',
    category: 'api',
    version: '2.1'
  }
});
```

### Step 4: Member Access Check

```typescript
// Verify all members can access
async function verifyTeamAccess(groupId: string, members: string[]) {
  for (const member of members) {
    const hasAccess = await nova.verifyMembership({
      groupId,
      accountId: member
    });
    console.log(`${member}: ${hasAccess ? '✓' : '✗'}`);
  }
}

await verifyTeamAccess(teamGroup.groupId, [
  'alice.near', 'bob.near', 'carol.near', 'david.near'
]);
// alice.near: ✓
// bob.near: ✓
// carol.near: ✓
// david.near: ✓
```

---

## Secure Offboarding

### Scenario

Remove a team member while ensuring they lose access to all shared files.

### Step 1: Identify Groups

```typescript
// Find all groups the departing member belongs to
const departingMember = 'david.near';
const allGroups = await nova.listGroups({});

const memberGroups = [];
for (const group of allGroups) {
  const isMember = await nova.verifyMembership({
    groupId: group.id,
    accountId: departingMember
  });
  if (isMember) {
    memberGroups.push(group);
  }
}

console.log(`${departingMember} is in ${memberGroups.length} groups`);
```

### Step 2: Remove from All Groups

```typescript
async function offboardMember(memberId: string, groups: Group[]) {
  const results = [];

  for (const group of groups) {
    try {
      await nova.removeMember({
        groupId: group.id,
        memberId: memberId
      });
      results.push({
        group: group.name,
        status: 'removed',
        keyRotated: true
      });
    } catch (error) {
      results.push({
        group: group.name,
        status: 'error',
        error: error.message
      });
    }
  }

  return results;
}

const offboardResults = await offboardMember(departingMember, memberGroups);
console.log('Offboarding complete:', offboardResults);
```

### Step 3: Verify Removal

```typescript
// Confirm the member no longer has access
for (const group of memberGroups) {
  const stillMember = await nova.verifyMembership({
    groupId: group.id,
    accountId: departingMember
  });

  if (stillMember) {
    console.error(`WARNING: ${departingMember} still has access to ${group.name}`);
  } else {
    console.log(`✓ ${departingMember} removed from ${group.name}`);
  }
}
```

### Step 4: Audit Trail

```typescript
// Check the transaction history
for (const group of memberGroups) {
  const history = await nova.getGroupHistory({
    groupId: group.id,
    limit: 5,
    types: ['MEMBER_REMOVED', 'KEY_ROTATED']
  });

  console.log(`\n${group.name} recent events:`);
  for (const tx of history.transactions) {
    console.log(`  ${tx.type}: ${tx.actor} at ${new Date(tx.timestamp)}`);
  }
}
```

### Complete Offboarding Script

```typescript
import { NovaSDK, Group } from 'nova-sdk-js';

async function secureOffboard(
  nova: NovaSDK,
  memberId: string
): Promise<OffboardingReport> {
  console.log(`Starting secure offboarding for ${memberId}`);

  // 1. Find all groups
  const allGroups = await nova.listGroups({});
  const memberGroups: Group[] = [];

  for (const group of allGroups) {
    const isMember = await nova.verifyMembership({
      groupId: group.id,
      accountId: memberId
    });
    if (isMember) {
      memberGroups.push(group);
    }
  }

  console.log(`Found ${memberGroups.length} groups to process`);

  // 2. Remove from each group
  const results = [];
  for (const group of memberGroups) {
    try {
      await nova.removeMember({
        groupId: group.id,
        memberId: memberId
      });

      // Key rotation is automatic
      const keyStatus = await nova.getKeyStatus(group.id);

      results.push({
        groupId: group.id,
        groupName: group.name,
        removed: true,
        newKeyVersion: keyStatus.keyVersion
      });
    } catch (error) {
      results.push({
        groupId: group.id,
        groupName: group.name,
        removed: false,
        error: error.message
      });
    }
  }

  // 3. Verify removal
  const verificationResults = [];
  for (const result of results) {
    if (result.removed) {
      const stillMember = await nova.verifyMembership({
        groupId: result.groupId,
        accountId: memberId
      });
      verificationResults.push({
        ...result,
        verified: !stillMember
      });
    }
  }

  // 4. Generate report
  return {
    memberId,
    timestamp: new Date().toISOString(),
    groupsProcessed: memberGroups.length,
    successful: results.filter(r => r.removed).length,
    failed: results.filter(r => !r.removed).length,
    details: verificationResults
  };
}

// Usage
const report = await secureOffboard(nova, 'david.near');
console.log(JSON.stringify(report, null, 2));
```

---

## Troubleshooting

### Common Issues

**"UNAUTHORIZED" error when uploading:**
- Verify you are a member of the group
- Check your NEAR account is connected correctly

**"SHADE_AGENT_ERROR":**
- The TEE service may be temporarily unavailable
- Retry with exponential backoff

**"IPFS_ERROR":**
- IPFS gateway may be overloaded
- Try a different gateway or retry later

**Key rotation taking too long:**
- Large groups take longer to rotate
- Wait for the operation to complete before retrying

### Getting Help

- GitHub Issues: https://github.com/jcarbonnell/nova/issues
- NEAR Discord: https://near.chat
- Phala Discord: https://discord.gg/phala
