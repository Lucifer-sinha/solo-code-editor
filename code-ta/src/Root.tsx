import React from 'react'
import Playground from './pages/Playground'
import { CollabProvider } from './context/CollabContext'

export default function Root() {
  return (
    <CollabProvider>
      <div className="app-container">
        <Playground />
      </div>
    </CollabProvider>
  )
}
