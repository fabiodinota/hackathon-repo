import { ArrowLeft, Check, ChevronRight, Home, Sparkles } from 'lucide-react'
import { useState } from 'react'

export function HomeBuyingChecklist({ onBack }: { onBack: () => void }) {
  const [checked, setChecked] = useState<number[]>([])
  const items = ['Define a realistic budget', 'Prepare the deposit', 'Estimate additional costs', 'Gather documents for mortgage preparation']
  return <div className="content checklist-view"><button className="back-button" onClick={onBack}><ArrowLeft size={18} /> KBC Assist</button><div className="checklist-hero"><span className="hero-icon"><Home size={25} /></span><p className="eyebrow">Your next step</p><h1>Home-buying checklist</h1><p>Small steps now can make your home search much easier.</p></div><div className="checklist-items">{items.map((item, index) => <button key={item} className={'check-item ' + (checked.includes(index) ? 'done' : '')} onClick={() => setChecked(current => current.includes(index) ? current.filter(i => i !== index) : [...current, index])}><span className="check-circle">{checked.includes(index) && <Check size={15} />}</span><span>{item}</span><ChevronRight size={17} /></button>)}</div><div className="tip-card"><Sparkles size={19} /><p><strong>Helpful tip</strong><br />Keep a little room in your monthly budget for unexpected costs.</p></div></div>
}
