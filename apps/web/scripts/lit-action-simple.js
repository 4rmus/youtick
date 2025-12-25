
(async () => {
    // Simple PKP authorization - no external auth needed
    // PKP ownership is verified by Lit nodes
    // pkpPublicKey comes from jsParams
    const pubKey = pkpPublicKey;
    Lit.Actions.setResponse({ 
        response: JSON.stringify({ 
            verified: true, 
            uid: pubKey 
        }) 
    });
})();
