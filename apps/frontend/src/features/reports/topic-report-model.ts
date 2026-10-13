/** Compatibility exports: computed report selection belongs to the repository,
 * never to a viewmodel. Native report retrieval remains separate. */
export {
  topicBuckets,
  type ReportTopic,
} from '../../data/repositories/derived-report-repository';
