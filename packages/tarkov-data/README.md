# @tarkov/data

Typed, Zod-validated TanStack Query data layer for the [`json.tarkov.dev`](https://json.tarkov.dev/endpoints) JSON API.

## Use

```tsx
import { TarkovDataProvider, createTarkovClient, useAmmoList } from "@tarkov/data";

const client = createTarkovClient("https://json.tarkov.dev/regular/");

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
