import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
import pickle

# Load dataset
df = pd.read_csv("../data/iot_dataset.csv")

# Combine text
df['text'] = df['project_title'] + " " + df['description']

# TF-IDF
vectorizer = TfidfVectorizer()
tfidf_matrix = vectorizer.fit_transform(df['text'])

# Save model
pickle.dump(vectorizer, open("vectorizer.pkl", "wb"))
pickle.dump(tfidf_matrix, open("tfidf_matrix.pkl", "wb"))
pickle.dump(df, open("dataset.pkl", "wb"))

print("Model trained and saved!")