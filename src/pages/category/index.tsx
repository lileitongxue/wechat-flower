import { View, Text, Image, ScrollView } from '@tarojs/components';
import { Input } from '@/components/ui/input';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, Category, Product } from '@/api';

const CategoryPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useLoad(async (params) => {
    try {
      const cats = await Api.getCategories();
      setCategories(cats || []);
      if (params.category_id) {
        setActiveCat(Number(params.category_id));
      }
      await fetchProducts(Number(params.category_id) || undefined, '');
    } catch (err) {
      console.error(err);
    }
  });

  const fetchProducts = async (cat?: number, kw?: string) => {
    setLoading(true);
    try {
      const data = await Api.getProducts({
        category_id: cat,
        keyword: kw || undefined,
        page_size: 50,
      });
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectCat = (id?: number) => {
    setActiveCat(id);
    fetchProducts(id, keyword);
  };

  const onSearch = () => {
    fetchProducts(activeCat, keyword.trim());
  };

  const goProduct = (id: number) => {
    Taro.navigateTo({ url: `/pages/product/index?id=${id}` });
  };

  return (
    <View className="min-h-screen bg-gray-50 flex flex-col">
      {/* 搜索栏 */}
      <View className="px-4 pt-3 pb-2 bg-white">
        <View className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
          <Text className="text-gray-400">🔍</Text>
          <Input
            className="flex-1 text-sm"
            placeholder="搜索鲜花..."
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            onConfirm={onSearch}
            confirmType="search"
          />
          <Text className="text-rose-600 text-sm" onClick={onSearch}>
            搜索
          </Text>
        </View>
      </View>

      {/* 分类 tab */}
      <ScrollView scrollX className="bg-white pb-2" enhanced showScrollbar={false}>
        <View className="flex px-2 gap-1">
          <View
            className={`px-4 py-2 rounded-full text-sm ${
              activeCat === undefined ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
            onClick={() => selectCat(undefined)}
          >
            全部
          </View>
          {(categories || []).map((c) => (
            <View
              key={c.id}
              className={`px-4 py-2 rounded-full text-sm ${
                activeCat === c.id ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}
              onClick={() => selectCat(c.id)}
            >
              {c.name}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 商品网格 */}
      <ScrollView scrollY className="flex-1 px-3 pt-3">
        {loading ? (
          <View className="py-10 text-center">
            <Text className="text-gray-400 text-sm">加载中...</Text>
          </View>
        ) : products.length === 0 ? (
          <View className="py-10 text-center">
            <Text className="text-gray-400 text-sm">暂无商品</Text>
          </View>
        ) : (
          <View className="grid grid-cols-2 gap-3 pb-4">
            {(products || []).map((p) => (
              <View
                key={p.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm"
                onClick={() => goProduct(p.id)}
              >
                <Image className="w-full h-44" src={p.image_url || ''} mode="aspectFill" />
                <View className="p-3">
                  <Text className="block text-sm font-medium text-gray-800 truncate">{p.name}</Text>
                  <Text className="block text-xs text-gray-400 mt-1 truncate">
                    {p.tags && p.tags.length > 0 ? p.tags.join(' · ') : '鲜花礼盒'}
                  </Text>
                  <View className="mt-2 flex items-center justify-between">
                    <View className="flex items-center gap-1">
                      <Text className="text-rose-600 text-base font-bold">¥{p.price}</Text>
                      {p.original_price ? (
                        <Text className="text-xs text-gray-400 line-through">¥{p.original_price}</Text>
                      ) : null}
                    </View>
                    <Text className="text-xs text-gray-400">已售{p.sales}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default CategoryPage;
