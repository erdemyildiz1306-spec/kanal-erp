import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Category from '@/models/Category';

export async function GET() {
  try {
    await connectToDatabase();
    let categories = await Category.find({}).sort({ name: 1 });
    
    // Eğer veritabanı boşsa mock veri döndürelim ve otomatik arka planda dolduralım
    if (categories.length === 0) {
      categories = [
        { categoryId: 104, name: "👕 Bebek Giyim & Aksesuar", parentId: null, isLeaf: true },
        { categoryId: 105, name: "👗 Çocuk Giyim", parentId: null, isLeaf: true },
        { categoryId: 106, name: "👖 Erkek Giyim", parentId: null, isLeaf: true },
        { categoryId: 107, name: "👚 Kadın Giyim", parentId: null, isLeaf: true },
        { categoryId: 108, name: "👟 Ayakkabı & Çanta", parentId: null, isLeaf: true },
        { categoryId: 109, name: "🧥 Çocuk Dış Giyim", parentId: 105, isLeaf: true },
        { categoryId: 110, name: "👶 Bebek Body & Zıbın", parentId: 104, isLeaf: true },
        { categoryId: 111, name: "👗 Kız Çocuk Elbise", parentId: 105, isLeaf: true },
        { categoryId: 112, name: "🧦 Çocuk Çorap", parentId: 105, isLeaf: true },
        { categoryId: 113, name: "👕 Erkek Çocuk Tişört", parentId: 105, isLeaf: true }
      ] as any;
    }
    
    return NextResponse.json(categories);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
