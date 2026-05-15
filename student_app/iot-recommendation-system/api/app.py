from flask import Flask, request, jsonify
import sys
import os

# Add model path
sys.path.append(os.path.abspath('../model'))

from predict import recommend

app = Flask(__name__)

@app.route('/predict', methods=['POST'])
def predict_api():
    data = request.json
    text = data['text']

    result = recommend(text)

    return jsonify({
        "components": result.split("|")
    })

@app.route('/')
def home():
    return "API is running 🚀"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)