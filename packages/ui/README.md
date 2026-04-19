# @tarkov/ui

Design tokens + shared React primitives for TarkovGunsmith.

## Use

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, TarkovIcon } from "@tarkov/ui";
import "@tarkov/ui/styles.css"; // or @import in your root CSS

function AmmoCard() {
  return (
    <Card>
      <CardHeader>
        <TarkovIcon itemId="5656d7c34bdc2d9d198b4587" alt="5.45 PS" />
        <CardTitle>5.45x39mm PS gs</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Add to comparison</Button>
      </CardContent>
    </Card>
  );
}
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
