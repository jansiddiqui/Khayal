import { BigButton } from "../../components/BigButton";
import { Layout } from "../../components/Layout";
import { copy } from "../../copy";

export function PatientHome() {
  return (
    <Layout title={copy.patientHome.greeting}>
      <p className="text-2xl">{copy.patientHome.subtitle}</p>
      <BigButton to="/patient/games" icon="🧩" label={copy.patientHome.playGames} />
    </Layout>
  );
}
