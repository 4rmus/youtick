import { notFound } from 'next/navigation';

// With two root layouts (app/(site), app/(tr)) there is no single layout for unmatched URLs.
// This catch-all sends them to the English root layout, so a 404 keeps the site shell and lang="en".
export default function MissingPage() {
    notFound();
}
