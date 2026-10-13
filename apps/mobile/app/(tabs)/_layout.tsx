import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/tab-bar';
import { strings } from '../../content/strings';
import { useCart } from '../../lib/queries/cart';
import { colors } from '../../lib/theme';

/** The four tabs, drawn by the floating green-and-gold TabBar. */
export default function TabsLayout() {
  const cart = useCart();
  const count = cart.data?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: strings.tabs.home }} />
      <Tabs.Screen name="shop" options={{ title: strings.tabs.shop }} />
      <Tabs.Screen name="bag" options={{ title: strings.tabs.bag, tabBarBadge: count > 0 ? count : undefined }} />
      <Tabs.Screen name="account" options={{ title: strings.tabs.account }} />
    </Tabs>
  );
}
