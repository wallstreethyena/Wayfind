// A branded not-found state for event URLs whose id no longer resolves
// (event removed by its provider, malformed slug, expired staple). Renders
// with a real 404 status via notFound() — never a silent redirect to /.
import EventNotFoundRecovery from "../../../components/EventNotFoundRecovery.js";

export default function EventNotFound() {
  return <EventNotFoundRecovery />;
}
