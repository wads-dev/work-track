import type { CompanyPeoplePage } from '../models/company-person.js';

export interface CompanyPeopleRepository {
  readPage(pageSize: number, pageToken?: string): Promise<CompanyPeoplePage>;
}
