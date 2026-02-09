/**
 * Post-Purchase Nova Group Automation
 *
 * Adds buyers to Nova groups after ticket purchase/claim
 * so they can immediately watch encrypted video content.
 *
 * Non-blocking: failures here don't affect ticket purchase success.
 */

import { addGroupMember } from './groups';
import { getProvider, viewContract } from '@/lib/near';
import { NEAR_CONFIG } from '@/lib/constants';

/**
 * Add buyer to the Nova group for a video after purchase/claim.
 *
 * Looks up the event's creator and their video tokens to find the
 * Nova group ID, then adds the buyer as a member.
 *
 * @param eventCid - The encrypted_cid of the purchased event
 * @param buyerAccountId - The buyer's NEAR account ID
 */
export async function addBuyerToNovaGroup(
  eventCid: string,
  buyerAccountId: string
): Promise<void> {
  try {
    console.log('[Nova Post-Purchase] Adding buyer to group...', {
      eventCid,
      buyerAccountId
    });

    const provider = getProvider();
    const contractId = NEAR_CONFIG.contractId;

    // 1. Get event to find creator
    const event = await viewContract<{
      creator_id: string;
      title: string;
      price: string;
    }>(provider, contractId, 'get_event', { encrypted_cid: eventCid });

    if (!event) {
      console.warn('[Nova Post-Purchase] Event not found:', eventCid);
      return;
    }

    const creatorId = event.creator_id;

    // 2. Get creator's tokens to find the nova_group_id for this event
    const tokensWithVideo = await viewContract<
      Array<[
        { token_id: string; owner_id: string },
        { encrypted_cid: string; nova_group_id: string | null; storage_type: string } | null
      ]>
    >(provider, contractId, 'get_tokens_with_video', {
      account_id: creatorId,
      from_index: '0',
      limit: 100
    });

    if (!tokensWithVideo || tokensWithVideo.length === 0) {
      console.warn('[Nova Post-Purchase] No tokens found for creator:', creatorId);
      return;
    }

    // Find the token matching this event's CID
    const matchingEntry = tokensWithVideo.find(
      ([_token, video]) => video && video.encrypted_cid === eventCid
    );

    if (!matchingEntry) {
      console.warn('[Nova Post-Purchase] No matching token found for CID:', eventCid);
      return;
    }

    const [_token, videoMeta] = matchingEntry;
    const novaGroupId = videoMeta?.nova_group_id;

    if (!novaGroupId) {
      console.warn('[Nova Post-Purchase] No Nova group ID on token for CID:', eventCid);
      return;
    }

    // 3. Add buyer to Nova group
    // Brief delay to let NEAR nonces settle after the purchase transactions
    await new Promise(resolve => setTimeout(resolve, 1500));
    await addGroupMember(novaGroupId, buyerAccountId, creatorId);

    console.log('[Nova Post-Purchase] Buyer added to Nova group:', {
      groupId: novaGroupId,
      buyer: buyerAccountId
    });
    console.log(`[DECENTRALIZATION_METRIC] {"operation":"post_purchase_nova","buyer":"${buyerAccountId}","groupId":"${novaGroupId}","timestamp":${Date.now()}}`);

  } catch (error) {
    // Non-blocking: log but don't throw
    console.error('[Nova Post-Purchase] Failed to add buyer to Nova group:', error);
    console.error('[Nova Post-Purchase] Ticket purchase was still successful. Video access may require manual grant.');
  }
}
