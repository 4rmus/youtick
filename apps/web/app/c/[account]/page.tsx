import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CreatorView } from '@/components/creator/CreatorView';
import { CREATOR_ACCOUNT_PATTERN, displayAccount } from '@/components/creator/creator-account';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { FEATURE_FLAGS } from '@/lib/constants';

type Props = { params: Promise<{ account: string }> };

async function accountParam(params: Props['params']): Promise<string | null> {
    try {
        const account = decodeURIComponent((await params).account);
        return CREATOR_ACCOUNT_PATTERN.test(account) ? account : null;
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const account = await accountParam(params);
    if (!account) return { title: 'Creator' };
    return {
        title: displayAccount(account),
        description: `Screenings by ${displayAccount(account)} on YouTick.`,
        alternates: { canonical: `/c/${account}` },
    };
}

export default async function CreatorPage({ params }: Props) {
    const account = await accountParam(params);
    if (!account) notFound();
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel) return <RuntimeClosed />;
    return <CreatorView accountId={account} />;
}
