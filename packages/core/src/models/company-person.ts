export interface CompanyPerson {
  uid: string;
  displayName: string | null;
  email: string;
  photoURL: string | null;
}

export interface CompanyPeoplePage {
  people: CompanyPerson[];
  nextPageToken: string | null;
}
