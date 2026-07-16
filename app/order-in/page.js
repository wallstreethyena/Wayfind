// app/order-in/page.js — server wrapper. check-seo requires every page.js to
// declare a canonical or noindex, but a client component cannot export metadata,
// so the route is a thin server component that carries the metadata
// (noindex + self-canonical, the /coupons pattern: a live, location-dependent
// utility page is not crawlable content) and renders ./OrderInClient.
import OrderInClient from "./OrderInClient";

export const metadata = {
  title: "Order In · Wayfind",
  description: "Delivery-worthy restaurants near you, ranked by the Wayfind Score — then order on Uber Eats.",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://www.gowayfind.com/order-in" },
};

export default function OrderInPage() {
  return <OrderInClient />;
}
