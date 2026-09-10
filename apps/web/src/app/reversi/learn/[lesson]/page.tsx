import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LessonScreen } from '@/components/lessons/LessonScreen';
import { findLesson, lessonMetadata, lessonStaticParams } from '@/components/lessons/lessonRoute';

type Props = { params: Promise<{ lesson: string }> };

export function generateStaticParams() {
  return lessonStaticParams('reversi');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lesson } = await params;
  return lessonMetadata('reversi', lesson);
}

export default async function ReversiLessonPage({ params }: Props) {
  const { lesson } = await params;
  // A renamed or removed lesson is a 404, not a screen apologising for itself.
  if (!findLesson('reversi', lesson)) notFound();
  return <LessonScreen game="reversi" lessonId={lesson} />;
}
