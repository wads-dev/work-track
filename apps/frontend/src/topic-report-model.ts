import { text } from './data';
import { isHidden, safeProject } from './privacy';
import type { TopicReportBucket } from './TopicReport';
export type ReportTopic = {
  projectId: string;
  topicId: string;
  label: string;
  minutes: number;
  byUser: { uid: string; label: string; minutes: number }[];
};
export function topicBuckets(
  topics: ReportTopic[],
  project: (id: string) => Record<string, unknown> | undefined,
  revealed: boolean,
  personalUid?: string,
): TopicReportBucket[] {
  return topics.map((topic) => {
    const metadata = project(topic.projectId);
    const hidden = isHidden(metadata, revealed);
    return {
      projectId: topic.projectId,
      topicId: topic.topicId,
      detailsAvailable: !hidden,
      projectLabel: text(
        safeProject(metadata, revealed).title,
        'Projeto reservado',
      ),
      topicLabel: hidden ? 'Tópico reservado' : text(topic.label, 'Tópico'),
      minutes: topic.minutes,
      people: (topic.byUser ?? [])
        .filter((person) => !personalUid || person.uid === personalUid)
        .map((person, index) => ({
          key: String(index),
          uid: revealed && !hidden ? person.uid : undefined,
          label: personalUid ? 'Você' : text(person.label, 'Pessoa'),
          minutes: person.minutes,
        })),
    };
  });
}
