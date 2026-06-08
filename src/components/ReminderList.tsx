import { categoryLabel, type Reminder } from '../utils/reminders'
import { formatDate } from '../utils/format'

export default function ReminderList({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) {
    return <div className="empty">期限・点検時期が近い項目はありません 👍</div>
  }
  return (
    <div>
      {reminders.map((r) => (
        <div className="reminder-item" key={r.id}>
          <span className={`badge ${r.severity === 'overdue' ? 'badge-overdue' : 'badge-soon'}`}>
            {r.severity === 'overdue' ? '超過' : 'まもなく'}
          </span>
          <span className="badge badge-cat">{categoryLabel[r.category]}</span>
          <div className="main">
            <div className="title">
              {r.bikeName}・{r.title}
            </div>
            <div className="sub">
              {r.detail}
              {r.dueDate ? `（${formatDate(r.dueDate)}）` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
