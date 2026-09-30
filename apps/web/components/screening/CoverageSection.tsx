import type { Messages } from '@/lib/i18n/messages';

/** Ticket scope in the wording of the V1 terms (device authorization is not the ticket duration). */
export function CoverageSection({ t }: { t: Messages['watch'] }) {
    return (
        <section aria-labelledby="coverage-title" className="flex flex-col gap-5">
            <h2 id="coverage-title" className="label-caps">{t.coverageTitle}</h2>
            <dl className="grid gap-x-8 gap-y-6 border-t border-line pt-6 sm:grid-cols-2">
                {t.coverage.map((item) => (
                    <div key={item.title} className="flex flex-col gap-1.5">
                        <dt className="font-display text-2xl">{item.title}</dt>
                        <dd className="text-sm leading-relaxed text-light-2">{item.body}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
