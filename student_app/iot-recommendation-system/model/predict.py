import pickle
import os
from sklearn.metrics.pairwise import cosine_similarity

# Get current file directory
BASE_DIR = os.path.dirname(__file__)

vectorizer = pickle.load(open(os.path.join(BASE_DIR, "vectorizer.pkl"), "rb"))
tfidf_matrix = pickle.load(open(os.path.join(BASE_DIR, "tfidf_matrix.pkl"), "rb"))
df = pickle.load(open(os.path.join(BASE_DIR, "dataset.pkl"), "rb"))

def recommend(input_text):
    input_vec = vectorizer.transform([input_text])
    similarity = cosine_similarity(input_vec, tfidf_matrix)[0]

    index = similarity.argmax()

    best_score = similarity[index]   # ⭐ THIS IS YOUR SCORE

    print("Similarity Score:", best_score)

    return df.iloc[index]['components']