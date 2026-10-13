// Compatibility exports only. Dataset selection belongs to the repository;
// screen hooks call its native-cache query API rather than these pure helpers.
export {
  filterRecords,
  recordPage,
  sortRecords,
  resolveRecordTopic,
  recordRange,
  type RecordFilters,
} from '../../data/repositories/browser-listing-repository';
