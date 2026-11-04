import { Card } from "../../components/Card";
import { Layout } from "../../components/Layout";

/** Placeholder for patient screens built in later milestones. */
export function ComingSoon({ title, message }: { title: string; message: string }) {
  return (
    <Layout title={title}>
      <Card>
        <p className="text-2xl">{message}</p>
      </Card>
    </Layout>
  );
}
