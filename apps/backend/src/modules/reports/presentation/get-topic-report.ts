import { HttpsError } from 'firebase-functions/v2/https';
import { authorizeReport, type ReportAuth } from './get-project-report.js';
import {
  getTopicReport,
  TopicReportError,
  topicInput,
  type TopicReportRepository,
} from '@work-track/core/reports/application/get-topic-report';
export { topicInput };
export type { TopicReportRepository };
export async function getTopicReportHandler(
  repository: TopicReportRepository,
  data: unknown,
  auth?: ReportAuth,
  asOf = Date.now(),
) {
  authorizeReport(auth);
  try {
    return await getTopicReport(repository, data, auth!.uid, asOf);
  } catch (error) {
    if (error instanceof TopicReportError)
      throw new HttpsError(error.code, error.message);
    throw error;
  }
}
