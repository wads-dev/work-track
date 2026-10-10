export interface Topic {
  mergedIntoTopicId?: string;
  mergedAt?: string;
  mergedBy?: string;
  archived?: boolean;
  id: string;
  title: string;
  description: string;
}
export interface Project {
  type?: 'personal' | 'work';
  githubUrl?: string | null;
  confidential?: boolean;
  publicAlias?: string;
  archived?: boolean;
  mergedInto?: string;
  mergeLock?: string;
  id: string;
  title: string;
  description: string;
  topics: Topic[];
  createdBy: string;
  createdAt: string;
}
