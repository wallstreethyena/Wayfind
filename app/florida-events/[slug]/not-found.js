// Boundary for /florida-events/<slug> when page.js calls notFound(). Keeps the
// real 404 status and shows live options instead of a dead end.
import EventNotFoundRecovery from "../../components/EventNotFoundRecovery.js";

export default function FloridaEventNotFound() {
  return <EventNotFoundRecovery />;
}
