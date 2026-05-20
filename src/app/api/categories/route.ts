import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Category from '@/models/Category';

type CatDoc = {
  categoryId: number;
  name: string;
  parentId: number | null;
  isLeaf: boolean;
};

function buildPathMap(rows: CatDoc[]) {
  const byId = new Map<number, CatDoc>();
  for (const r of rows) byId.set(r.categoryId, r);

  const pathMemo = new Map<number, string>();

  function pathFor(id: number): string {
    if (pathMemo.has(id)) return pathMemo.get(id)!;
    const row = byId.get(id);
    if (!row) {
      pathMemo.set(id, '?');
      return '?';
    }
    if (row.parentId === null || row.parentId === undefined) {
      pathMemo.set(id, row.name);
      return row.name;
    }
    const p = `${pathFor(row.parentId)} › ${row.name}`;
    pathMemo.set(id, p);
    return p;
  }

  const withPath = rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    parentId: r.parentId,
    isLeaf: r.isLeaf,
    path: pathFor(r.categoryId),
  }));

  const leafOnly = withPath.filter((c) => c.isLeaf).sort((a, b) => a.path.localeCompare(b.path, 'tr'));
  const treeRoots = rows.filter((r) => r.parentId === null || r.parentId === undefined);

  function nest(parentId: number | null): { categoryId: number; name: string; children?: unknown[] }[] {
    return rows
      .filter((r) =>
        parentId === null ? r.parentId === null || r.parentId === undefined : r.parentId === parentId
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map((r) => {
        const children = nest(r.categoryId);
        return {
          categoryId: r.categoryId,
          name: r.name,
          isLeaf: r.isLeaf,
          ...(children.length > 0 ? { children } : {}),
        };
      });
  }

  return {
    leafOnly,
    withPath,
    tree: nest(null),
    rootsSample: treeRoots.length,
  };
}

export async function GET() {
  try {
    await connectToDatabase();
    const rows = (await Category.find({}).sort({ categoryId: 1 }).lean()) as CatDoc[];
    const built = buildPathMap(rows);
    return NextResponse.json({
      success: true,
      ...built,
      count: rows.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
