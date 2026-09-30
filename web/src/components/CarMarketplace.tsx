import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Car, Check, Mail, MapPin, Phone, User, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

export function CarMarketplace() {
  const [showOrder, setShowOrder] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
  }

  return <div className="car-site">
    <header className="car-site-header">
      <span className="car-site-spacer" aria-hidden="true" />
      <div className="car-brand"><span className="car-brand-mark"><Car size={16} /></span><span>Drive<span>ly</span></span></div>
      <span className="car-demo-label">Demo site</span>
    </header>
    {!showOrder ? <div className="car-content">
      <p className="car-eyebrow">Matched for your next drive</p>
      <h1>Meet your new<br /><span>electric everyday.</span></h1>
      <p className="car-intro">A compact electric SUV with room for the moments that matter.</p>
      <figure className="car-photo"><div className="car-image-card"><span className="car-image-badge">NEW · 2025</span><img src="/car.jpg" alt="Grey Volvo EX30 parked on a street, viewed from the front and side" width="1280" height="736" /></div><figcaption>Photo: <a href="https://commons.wikimedia.org/wiki/File:Volvo_EX30_IMG_8923.jpg" target="_blank" rel="noreferrer">Alexander Migl</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></figcaption></figure>
      <div className="car-name-row"><div><h2>Volvo EX30</h2><p>Single Motor Extended Range</p></div><div className="car-rating"><BadgeCheck size={15} /> 4.9</div></div>
      <div className="car-specs"><span>⚡ Electric</span><span>◉ Automatic</span><span>◷ 480 km range</span></div>
      <div className="car-price-row"><div><small>Starting from</small><strong>€ 39,990</strong><small>or € 479 / month</small></div><button className="car-order-button" onClick={() => setShowOrder(true)}>Order now <ArrowRight size={16} /></button></div>
    </div> : submitted ? <OrderSubmitted onBack={() => { setSubmitted(false); setShowOrder(false) }} /> : <OrderForm onBack={() => setShowOrder(false)} onSubmit={submitOrder} />}
  </div>
}

function OrderForm({ onBack, onSubmit }: { onBack: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="car-content order-content"><button className="order-back" onClick={onBack}><ArrowLeft size={17} /> Back to vehicle</button><p className="car-eyebrow">Reserve your vehicle</p><h1>Tell us where<br /><span>to reach you.</span></h1><p className="car-intro">Enter your details to continue with the reservation.</p><form className="order-form" onSubmit={onSubmit}><label><span><User size={15} /> Full name</span><input required name="fullName" autoComplete="name" placeholder="Alex Morgan" /></label><label><span><Mail size={15} /> Email address</span><input required type="email" name="email" autoComplete="email" defaultValue="alex@example.com" placeholder="alex@example.com" /></label><label><span><Phone size={15} /> Phone number</span><input required type="tel" name="phone" autoComplete="tel" placeholder="+32 470 00 00 00" /></label><label><span><MapPin size={15} /> Delivery postcode</span><input required name="postcode" autoComplete="postal-code" placeholder="2000 Antwerp" /></label><label><span><CalendarDays size={15} /> Preferred delivery month</span><input required type="month" name="deliveryMonth" /></label><button className="car-order-button form-submit" type="submit">Continue <ArrowRight size={16} /></button></form></div>
}

function OrderSubmitted({ onBack }: { onBack: () => void }) { return <div className="car-content order-success"><span className="success-icon"><Check size={27} /></span><p className="car-eyebrow">Reservation ready</p><h1>Your request is<br /><span>ready to go.</span></h1><p className="car-intro">Your reservation details are ready for the next step.</p><div className="success-summary"><strong>Volvo EX30</strong><span>€ 39,990</span></div><button className="car-order-button" onClick={onBack}>Back to marketplace <ArrowRight size={16} /></button><button className="car-text-button" onClick={onBack}><X size={15} /> Close</button></div> }
