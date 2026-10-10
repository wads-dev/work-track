import { useState } from 'react';
import { useCompanyPeople } from './CompanyPeopleContext';
import { usePrivacy } from '../../shared/ui/privacy';
import { resolvePersonIdentity } from './person-identity';

export function PersonIdentity({
  uid,
  fallback,
  label,
  avatarOnly = false,
}: {
  uid?: string;
  fallback?: string;
  label?: string;
  avatarOnly?: boolean;
}) {
  const directory = useCompanyPeople();
  const { revealed } = usePrivacy();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  if (!revealed) return <span>Pessoa</span>;
  const identity = resolvePersonIdentity(
    directory.person(uid || ''),
    fallback,
    directory.loading,
    uid,
  );
  const name = label || identity.name;
  return (
    <span
      className="inline-flex max-w-full items-center gap-2 align-middle"
      title={name}
    >
      {identity.photo && failedPhoto !== identity.photo ? (
        <img
          src={identity.photo}
          alt=""
          className="size-7 shrink-0 rounded-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedPhoto(identity.photo)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
        >
          {identity.initials}
        </span>
      )}
      <span className={avatarOnly ? 'sr-only' : 'min-w-0 truncate'}>
        {name}
      </span>
    </span>
  );
}
