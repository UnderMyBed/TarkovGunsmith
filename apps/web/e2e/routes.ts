/**
 * Every routed page we ship today, with text the loaded page must show. Keep in sync with the
 * `__root.tsx` nav. `smoke.spec.ts` loads each at desktop width and `phone.spec.ts` at phone
 * width, so a route added here is covered at both.
 */
export const ROUTES: ReadonlyArray<{
  path: string;
  /** Text we expect on the loaded page. */
  contains: string;
}> = [
  { path: "/", contains: "Build the" },
  { path: "/builder", contains: "No weapon selected" },
  { path: "/builder/compare", contains: "Add a second build" },
];
