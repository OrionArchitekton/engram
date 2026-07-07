import { DEMO_FIXTURE, DEMO_SCENES } from "@/lib/demo-fixture";
import EngramApp from "./EngramApp";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const demo = params.demo === "1";
  const scene = typeof params.scene === "string" ? DEMO_SCENES[params.scene] : undefined;
  return <EngramApp fixture={demo ? (scene ?? DEMO_FIXTURE) : null} />;
}
