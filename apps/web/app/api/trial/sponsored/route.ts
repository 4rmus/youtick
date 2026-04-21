import { NextResponse, NextRequest } from "next/server";
import { addCorsHeaders, handleCorsPreflightRequest, checkCors } from "@/lib/cors";

/**
 * Sponsored Trial API - Deprecated
 *
 * Relayer-based trial creation has been removed.
 * Clients should use the direct onboarding key path via createSponsoredTrialDirect().
 */
export async function POST(request: NextRequest) {
    const corsBlock = checkCors(request);
    if (corsBlock) return corsBlock;

    return addCorsHeaders(
        NextResponse.json(
            {
                error: "Relayer-based trial creation is no longer supported. Use the direct onboarding key path instead.",
                code: "RELAYER_DEPRECATED",
            },
            { status: 410 } // Gone
        ),
        request,
    );
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request);
}
