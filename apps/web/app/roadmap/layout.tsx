import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Roadmap | YouTick',
  description: 'YouTick platform roadmap — milestones and upcoming features on NEAR Protocol.',
};

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
