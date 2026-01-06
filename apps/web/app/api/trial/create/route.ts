import { NextResponse } from "next/server";
import { YouTickKeypomManager, getKeypomManager } from "@/lib/keypom";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // Optional: Add admin protection or rate limiting here
        // For now, open for demo purposes

        // Get the Funder Private Key from environment variables
        // This key MUST be set in .env.local for the server to fund trials
        const funderPrivateKey = process.env.KEYPOM_FUNDER_PRIVATE_KEY;

        if (!funderPrivateKey) {
            return NextResponse.json(
                { error: "Server configuration error: Missing funder key" },
                { status: 500 }
            );
        }

        const manager = getKeypomManager();
        await manager.init(funderPrivateKey);

        // Create a single-use trial drop
        const links = await manager.createTrialAccountDrop({
            numKeys: 1,
            metadata: "YouTick Trial"
        });

        if (!links || links.length === 0) {
            throw new Error("Failed to generate trial link");
        }

        // Return the link
        return NextResponse.json({
            link: links[0],
            success: true
        });

    } catch (error: any) {
        console.error("Trial creation error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create trial" },
            { status: 500 }
        );
    }
}
