#
# Setup Python package and module structure. This script should be
# placed in the top level of the repository and used by running:
#
# pip3 install setuptools
# pip3 install -e .
#

from setuptools import setup, find_packages

setup(
    name='Generative AI',
    version='0.1.0',
    packages=find_packages(),
    install_requires=[
        'openai',
        'tenacity',
        'numpy',
        'hdbscan',
        'scikit-learn',
        'requests',
        'bs4',
        'cbor2',
        'Pillow',
        'termcolor'
    ],
    entry_points={
        'console_scripts': [
            # Define command line scripts here if needed
        ],
    },
    author='Francis Crimmins',
    author_email='fcrimmins@nla.gov.au',
    description='Tools for generative AI',
    #long_description=open('README.md').read(),
    #long_description_content_type='text/markdown',
    #url='https://github.com/nla/gen_ai',
    classifiers=[
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
    ],
    python_requires='>=3.6',
)
