interface TabsProps {
  tabs: string[]
  activeTab: string
  setActiveTab: (tab: string) => void
}

export default function Tabs({ tabs, activeTab, setActiveTab }: TabsProps) {
  return (
    <div className="tabs">
      {tabs.map(tab => (
        <button 
          key={tab}
          className={tab === activeTab ? 'active' : ''}
          onClick={() => setActiveTab(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
