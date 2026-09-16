import { FivemPanel } from './FivemPanel'
import { SoundsPanel } from './SoundsPanel'
import './games.css'

export default function GamesScreen() {
  return (
    <div className="fm-screen">
      <FivemPanel />
      <SoundsPanel />
    </div>
  )
}
