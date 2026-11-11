import {
  SNOWCAT_ADDONS,
  SNOWCAT_PRICE_NOTE,
  SNOWCAT_SERVICE_FEE,
  SNOWCAT_TICKET_NOTES,
  SNOWCAT_TICKET_TITLE,
  SNOWCAT_TICKETS,
} from "../../lib/snowcatTickets.js";

const CSS = `
.wf-snowcat-tickets{margin:16px 0 0;padding:14px 14px 12px;border:1px solid #21262D;border-radius:14px;background:#161B22;color:#E6EDF3}
.wf-snowcat-tickets h2{margin:0 0 6px;font-size:18px;line-height:1.25;font-weight:800;color:#fff}
.wf-snowcat-tickets p{margin:0 0 10px;font-size:13.5px;line-height:1.45;color:#9eaab7}
.wf-snowcat-tickets table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.4}
.wf-snowcat-tickets th,.wf-snowcat-tickets td{text-align:left;vertical-align:top;padding:8px 10px 8px 0;border-top:1px solid #26303B}
.wf-snowcat-tickets th{font-size:12px;font-weight:700;color:#9eaab7}
.wf-snowcat-tickets .wf-snowcat-options td:first-child{font-weight:700;color:#fff;width:34%}
.wf-snowcat-tickets .wf-snowcat-options td:last-child{color:#C9D1D9;font-weight:500;font-size:13px;line-height:1.4}
.wf-snowcat-addons td:last-child,.wf-snowcat-addons th:last-child{text-align:right;white-space:nowrap;color:#FFC08F;font-weight:800}
.wf-snowcat-tickets .wf-snowcat-notes{margin:10px 0 0;padding:0;list-style:none}
.wf-snowcat-tickets .wf-snowcat-notes li{margin:0 0 4px;font-size:13.5px;line-height:1.4;color:#E6EDF3}
`;

export default function SnowcatTicketExplainer() {
  return (
    <section className="wf-snowcat-tickets" data-snowcat-tickets="" aria-labelledby="snowcat-ticket-title">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <h2 id="snowcat-ticket-title">{SNOWCAT_TICKET_TITLE}</h2>
      <p>{SNOWCAT_PRICE_NOTE}</p>
      <p>{SNOWCAT_SERVICE_FEE}</p>
      <table className="wf-snowcat-options">
        <thead>
          <tr><th scope="col">Ticket</th><th scope="col">Includes</th></tr>
        </thead>
        <tbody>
          {SNOWCAT_TICKETS.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.includes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="wf-snowcat-addons">
        <thead>
          <tr><th scope="col">Add ons</th><th scope="col">Price</th></tr>
        </thead>
        <tbody>
          {SNOWCAT_ADDONS.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="wf-snowcat-notes">
        {SNOWCAT_TICKET_NOTES.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}
