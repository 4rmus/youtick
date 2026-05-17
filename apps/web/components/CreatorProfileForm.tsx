'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { useCreatorProfile } from '@/hooks/useCreatorStats';
import { useLanguage } from '@/components/providers/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, User, Globe, AtSign, Camera, Save } from 'lucide-react';
import { actions } from 'near-api-js';
import { NEAR_CONFIG, GAS_CONSTANTS } from '@/lib/constants';
import { useQueryClient } from '@tanstack/react-query';

interface CreatorProfileFormProps {
    onSuccess?: () => void;
    className?: string;
}

export function CreatorProfileForm({ onSuccess, className }: CreatorProfileFormProps) {
    const { t } = useLanguage();
    const { accountId, getWallet } = useWallet();
    const queryClient = useQueryClient();
    const { data: existingProfile, isLoading: profileLoading } = useCreatorProfile(accountId ?? undefined);

    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [website, setWebsite] = useState('');
    const [twitter, setTwitter] = useState('');
    const [instagram, setInstagram] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (existingProfile) {
            setDisplayName(existingProfile.display_name || '');
            setBio(existingProfile.bio || '');
            setWebsite(existingProfile.website || '');
            setTwitter(existingProfile.twitter || '');
            setInstagram(existingProfile.instagram || '');
            setAvatarUrl(existingProfile.avatar_url || '');
        }
    }, [existingProfile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accountId) return;

        setSaving(true);
        setSaveError(null);
        setSaved(false);

        try {
            const wallet = await getWallet();
            await wallet.signAndSendTransaction({
                receiverId: NEAR_CONFIG.contractId,
                actions: [
                    actions.functionCall(
                        'set_creator_profile',
                        {
                            display_name: displayName.trim() || null,
                            bio: bio.trim() || null,
                            website: website.trim() || null,
                            twitter: twitter.trim() || null,
                            instagram: instagram.trim() || null,
                            avatar_url: avatarUrl.trim() || null,
                        },
                        GAS_CONSTANTS.mediumGas,
                        BigInt(0)
                    ),
                ],
            });

            queryClient.invalidateQueries({ queryKey: ['creatorProfile', accountId] });
            setSaved(true);
            onSuccess?.();
        } catch (err) {
            console.error('Failed to save profile:', err);
            setSaveError(err instanceof Error ? err.message : 'Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    if (profileLoading) {
        return (
            <div className={`flex items-center justify-center py-8 ${className}`}>
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        {t.profile_page?.display_name || 'Display Name'}
                    </label>
                    <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={t.profile_page?.display_name_placeholder || 'Your name'}
                        maxLength={100}
                        className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        {t.profile_page?.website || 'Website'}
                    </label>
                    <Input
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://..."
                        maxLength={200}
                        className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <AtSign className="w-3.5 h-3.5" />
                        {t.profile_page?.twitter || 'Twitter / X'}
                    </label>
                    <Input
                        value={twitter}
                        onChange={(e) => setTwitter(e.target.value)}
                        placeholder="@username"
                        maxLength={100}
                        className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5" />
                        {t.profile_page?.instagram || 'Instagram'}
                    </label>
                    <Input
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        placeholder="@username"
                        maxLength={100}
                        className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    {t.profile_page?.avatar_url || 'Avatar URL'}
                </label>
                <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://... or ipfs://..."
                    maxLength={500}
                    className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">
                    {t.profile_page?.bio || 'Bio'}
                </label>
                <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t.profile_page?.bio_placeholder || 'Tell viewers about yourself...'}
                    maxLength={1000}
                    className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 min-h-[80px] resize-none"
                />
            </div>

            {saveError && (
                <p className="text-sm text-red-400">{saveError}</p>
            )}
            {saved && (
                <p className="text-sm text-near-green">{t.profile_page?.profile_saved || 'Profile saved!'}</p>
            )}

            <div className="flex justify-end">
                <Button
                    type="submit"
                    disabled={saving || !accountId}
                    className="bg-near-green hover:bg-near-green/90 text-black"
                >
                    {saving ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {t.profile_page?.saving || 'Saving...'}</>
                    ) : (
                        <><Save className="w-4 h-4 mr-2" /> {t.profile_page?.save_profile || 'Save Profile'}</>
                    )}
                </Button>
            </div>
        </form>
    );
}
