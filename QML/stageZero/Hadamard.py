import jax
import jax.numpy as jnp

jax.config.update('jax_enable_x64', True)

# ket0 -- 1 x 2
ket0 = jnp.array([1.0, 0.0], dtype=jnp.complex128)

# Hadamard transformation -- 2 x 2
H = jnp.array([[1, 1], 
               [1, -1]], dtype=jnp.complex128) / jnp.sqrt(2)

# apply a linear transformation U to a vector psi
def apply (U, psi):
    return U @ psi

# evolution occurs when the state vector is transformed by a unitary matrix, preserving inner products 
# a unitary matrix is a complex matrix such that U = U*, where U* is transposed and conjugated from U. 
psi = apply(H, ket0)

# the Born rule states that the square of the state vector's amplitudes is the probability the qubit is in that state
probs = psi**2

