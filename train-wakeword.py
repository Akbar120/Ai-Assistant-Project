import os
from openwakeword.train import train_custom_model

print("Starting training for 'sobo.onnx' wake word...")

# Where to save the output
output_dir = os.path.join(os.path.dirname(__file__), "src", "voice_engine", "models")
os.makedirs(output_dir, exist_ok=True)

# Train the model (this downloads the base model and generates synthetic data)
train_custom_model(
    target_phrase="sobo",
    output_dir=output_dir,
    batch_size=8,
    epochs=1, # Keep it extremely fast for this demo
    n_samples=500 # Generate 500 synthetic examples
)

print(f"Training complete. Model saved in: {output_dir}")
