import { ArrowRight, Landmark, MoreHorizontal } from "lucide-react";

export function Dashboard() {
  return (
    <div className="content">
      <section className="greeting">
        <div>
          <p className="eyebrow">Your everyday banking</p>
          <h1>Good morning, Alex</h1>
        </div>
        <div className="weather" aria-hidden="true">
          ☀️ <span>18°</span>
        </div>
      </section>
      <section className="balance-card" aria-label="Demo current account">
        <div className="balance-head">
          <span>Total available</span>
          <span className="demo-label">Demo account</span>
        </div>
        <strong>€ 4,280.50</strong>
        <p>Current account · **** 5821</p>
        <div className="balance-row">
          <span>+ € 2,450.00 this month</span>
          <span className="positive">↑ 4.8%</span>
        </div>
      </section>
      <div className="quick-actions" aria-label="Banking actions preview">
        <div className="quick-action">
          <span>
            <ArrowRight />
          </span>
          Transfer
        </div>
        <div className="quick-action">
          <span>
            <Landmark />
          </span>
          Pay
        </div>
        <div className="quick-action">
          <span>
            <MoreHorizontal />
          </span>
          More
        </div>
      </div>
      <section className="home-overview">
        <p className="eyebrow">Your KBC overview</p>
        <h2>What would you like to do?</h2>
        <div className="overview-row">
          <div>
            <strong>€ 1,240.00</strong>
            <span>Upcoming payments</span>
          </div>
          <div>
            <strong>3</strong>
            <span>Recent transactions</span>
          </div>
        </div>
      </section>
    </div>
  );
}
