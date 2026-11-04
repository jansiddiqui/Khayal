import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../../api/client";
import { CaregiverLayout } from "../../components/CaregiverLayout";

export function CaregiverDashboard() {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });

  return (
    <CaregiverLayout title="Dashboard">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-gray-700">
          Backend status:{" "}
          {health.isPending && <span>checking…</span>}
          {health.isError && <span className="font-semibold text-red-700">unreachable</span>}
          {health.isSuccess && <span className="font-semibold text-calm">{health.data.status}</span>}
        </p>
        <p className="mt-2 text-gray-600">Patients, trends and alerts will appear here in later milestones.</p>
      </div>
    </CaregiverLayout>
  );
}
