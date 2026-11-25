import Image from "next/image";

const deliverables = [
  {
    title: "Opportunity brief",
    meta: "Delivered · review available",
    icon: "/assets/1ddfd.svg",
  },
  {
    title: "Website concept",
    meta: "Mockup complete · version 1",
    icon: "/assets/2d54d.svg",
  },
  {
    title: "Automated workflow spec",
    meta: "Draft package · output linked",
    icon: "/assets/9844c.svg",
  },
];

export const metadata = { title: "Finished" };

export default function FinishedPage() {
  return (
    <div className="finished-page">
      <div className="finished-atmosphere" aria-hidden="true">
        <Image className="atmosphere-upper" src="/assets/8c382.svg" alt="" width={375} height={310} />
        <Image className="atmosphere-middle" src="/assets/b6978.svg" alt="" width={490} height={300} />
        <Image className="atmosphere-lower" src="/assets/661cc.svg" alt="" width={410} height={250} />
      </div>
      <section className="finished-heading">
        <h1>Finished</h1>
        <p>Completed work, deliverables, and evidence.</p>
        <div className="pills" aria-label="Deliverable filters">
          <span className="active">Recent</span>
          <span>Files</span>
          <span>Reports</span>
          <span>Approvals</span>
        </div>
      </section>

      <section className="receipt-summary">
        <p>COMPLETION CENTER</p>
        <h2>Your outcomes, all in one place</h2>
        <span>Demo items shown below</span>
      </section>

      <section className="deliverables" aria-labelledby="deliverables-heading">
        <h2 id="deliverables-heading">Recent deliverables</h2>
        <div className="deliverable-list">
          {deliverables.map((item) => (
            <article className="deliverable-row" key={item.title}>
              <Image src={item.icon} alt="" width={34} height={34} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.meta}</p>
              </div>
              <Image className="row-arrow" src="/assets/e915f.svg" alt="" width={21} height={21} />
            </article>
          ))}
        </div>
      </section>

      <p className="receipt-footnote">Production items require verified result receipts.</p>
    </div>
  );
}
