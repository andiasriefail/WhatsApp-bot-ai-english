'use strict'

function createQueue() {
    const items = []
    let activeId = null
    const advanceListeners = new Set()

    function processNext() {
        if (activeId !== null) return
        const next = items.shift()
        if (!next) return
        if (next.cancelled) { processNext(); return }

        activeId = next.id

        for (const fn of advanceListeners) { try { fn() } catch (_) {} }
        Promise.resolve()
            .then(() => next.run())
            .then(result => { next.resolve(result) })
            .catch(err => { next.reject(err) })
            .finally(() => {
                activeId = null
                processNext()
            })
    }

    function add(run) {
        const id = Symbol('queue-item')
        const promise = new Promise((resolve, reject) => {
            items.push({ id, run, resolve, reject, cancelled: false })
            processNext()
        })
        return { id, promise }
    }

    function cancelWaiting(id) {
        const idx = items.findIndex(it => it.id === id)
        if (idx === -1) return false
        items[idx].cancelled = true
        items[idx].reject(new Error('CANCELLED_WHILE_WAITING'))
        items.splice(idx, 1)
        return true
    }

    function onAdvance(fn) { advanceListeners.add(fn) }
    function offAdvance(fn) { advanceListeners.delete(fn) }

    function isActive(id) { return activeId === id }
    function position(id) {
        const idx = items.findIndex(it => it.id === id)
        return idx === -1 ? -1 : idx + 1
    }

    return { add, cancelWaiting, isActive, position, onAdvance, offAdvance }
}

module.exports = { createQueue }
