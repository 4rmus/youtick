'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center text-white">
            <div>
                <h1 className="text-2xl font-bold">Something went wrong</h1>
                <p className="mt-3 text-zinc-400">The request failed safely. Try again.</p>
                <button className="mt-6 rounded-lg bg-white px-5 py-2 text-black" onClick={reset}>Try again</button>
            </div>
        </div>
    );
}
