/**
 * dsh-thought-collapse — Host half.
 *
 * The whole feature is Client-side view state: whether one analysis block is
 * folded belongs to the Chat seat that renders it, so there is nothing to mount
 * on the Host. This module still exists, and is not a stub for symmetry alone:
 * a Cordis bundle needs a real Host half so the Loader has one Fiber whose
 * lifetime both the Toggle in 插件 → 已安装插件 and the Client half follow.
 *
 * `activate` / `deactivate` are written out explicitly, so the two halves of the
 * lifecycle are readable and independently testable; `apply` is the Cordis entry
 * point that ties them to the owning Fiber.
 */

/**
 * Register everything the Host half owns.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx owning Cordis context.
 * @returns {() => void} disposer that releases every Host resource.
 */
export function activate(ctx) {
  const disposers = []

  // Nothing to register today. The array is the extension point: a future
  // Host-side resource (a persisted preference read through `ctx.settings`, an
  // RPC handler registered with `ctx.harness.handle`) lands here and keeps the
  // same cleanup contract, so `deactivate` stays correct without edits.
  void ctx

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

/**
 * Release everything `activate` registered.
 *
 * Kept separate from the disposer above so the "off" edge is a named, testable
 * step rather than an anonymous closure: a Host resource added later goes here
 * when its cleanup needs the context itself (for example `ctx.logger`).
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx owning Cordis context.
 * @returns {void}
 */
export function deactivate(ctx) {
  void ctx
}

/**
 * Cordis entry point: tie the activation lifetime to this plugin's Fiber.
 *
 * `ctx.effect` runs the callback immediately and calls the returned disposer
 * when the Fiber is disposed — that is the Toggle's off edge — so activation and
 * deactivation cannot drift apart.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx owning Cordis context.
 */
export function apply(ctx) {
  ctx.effect(() => {
    const dispose = activate(ctx)
    return () => {
      try {
        dispose()
      } finally {
        deactivate(ctx)
      }
    }
  }, 'thought-collapse: lifecycle')
}
