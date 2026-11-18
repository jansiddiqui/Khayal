import { useLocation } from "react-router";
import { copy } from "../copy";
import { t } from "../t";
import { Busy, Skeleton, SkeletonLines } from "./Skeleton";
import { Spinner } from "./Spinner";

/** The patient screen's shape while its page loads: the top bar, a title and big buttons. */
export function PatientSkeleton() {
  return (
    <Busy label={copy.common.loading} className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-4 sm:px-8">
      <div className="grid grid-cols-[auto_1fr] gap-3 sm:flex">
        <Skeleton className="h-[5.5rem] w-24 rounded-2xl" />
        <Skeleton className="h-[5.5rem] w-full rounded-2xl sm:w-72" />
      </div>
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </Busy>
  );
}

/** The caregiver screen's shape: the header bar, a title and a few cards. */
export function CaregiverSkeleton() {
  return (
    <Busy label={t.family.ui.loading} className="caregiver min-h-screen bg-desk text-sm">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-line bg-surface p-4">
              <SkeletonLines lines={3} />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </Busy>
  );
}

/** Whatever is loading, the right shape for where the person is going. */
export function RouteSkeleton() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/patient")) return <PatientSkeleton />;
  if (pathname.startsWith("/caregiver") || pathname.startsWith("/admin")) return <CaregiverSkeleton />;
  return (
    <p role="status" className="flex items-center gap-3 p-8 text-2xl text-ink-soft">
      <Spinner />
      {copy.common.loading}
    </p>
  );
}
