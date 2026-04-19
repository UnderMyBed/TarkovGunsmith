# @tarkov/data

Typed, Zod-validated TanStack Query data layer for `api.tarkov.dev`.

## Use

```tsx
import { TarkovDataProvider, createTarkovClient, useAmmoList } from "@tarkov/data";

const client = createTarkovClient("https://api.tarkov.dev/graphql");

function App() {
  return (
    <TarkovDataProvider client={client}>
      <AmmoTable />
    </TarkovDataProvider>
  );
}

function AmmoTable() {
  const { data, isLoading } = useAmmoList();
  if (isLoading || !data) return <div>Loading…</div>;
  return (
    <ul>
      {data.map((a) => (
        <li key={a.id}>{a.name}</li>
      ))}
    </ul>
  );
}
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
