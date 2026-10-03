import { addDays, dayKey, hoursText, isoWeekday, LEVEL_STYLE, shortDay } from '../utils/timelineDates'

/**
 * One cell per day showing how full that day is, using the numbers the server
 * worked out (never recomputed here, so the strip and the warnings always
 * agree). Sits above the timeline lanes and shares their day width.
 */
export default function LoadStrip({ days, from, totalDays, dayWidth, workDays, orgNames, today }) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const showHours = dayWidth >= 28

  return (
    <div className="flex" role="list" aria-label="Workload per day" data-testid="load-strip">
      {Array.from({ length: totalDays }, (_, i) => {
        const date = addDays(from, i)
        const key = dayKey(date)
        const info = byDate.get(key)
        const working = workDays.includes(isoWeekday(date))
        const isToday = key === dayKey(today)

        let label = `${shortDay(date)}: nothing planned`
        let cls = working ? 'bg-slate-800/60' : 'bg-slate-900'
        let text = ''
        if (info) {
          const style = LEVEL_STYLE[info.level]
          cls = style.cell
          const where = (info.org_ids || []).map((id) => orgNames.get(id)).filter(Boolean)
          label = `${shortDay(date)}: ${hoursText(info.hours)} of ${info.capacity ? hoursText(info.capacity) : 'no capacity (day off)'} — ${style.text}` +
            `, ${info.task_ids.length} task${info.task_ids.length === 1 ? '' : 's'}${where.length ? ` in ${where.join(', ')}` : ''}`
          if (showHours) text = String(Math.round(info.hours))
        } else if (!working) {
          label = `${shortDay(date)}: day off`
        }
        return (
          <div
            key={key}
            role="listitem"
            title={label}
            aria-label={label}
            data-date={key}
            data-level={info ? info.level : working ? 'free' : 'off'}
            style={{ width: dayWidth, minWidth: dayWidth }}
            className={`h-6 border-r border-slate-950/60 text-[10px] leading-6 text-center text-white/90 ${cls} ${isToday ? 'ring-1 ring-inset ring-brand-400' : ''}`}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}
