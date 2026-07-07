import { DEMO_FIXTURE } from "@/lib/demo-fixture";
import EngramApp from "./EngramApp";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const demo = params.demo === "1";
  return <EngramApp fixture={demo ? DEMO_FIXTURE : null} />;
}
